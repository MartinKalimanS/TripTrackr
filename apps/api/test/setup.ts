import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';

import {
  API_ROLE_PASSWORD,
  RUSTFS_IMAGE,
  TEST_S3,
  apiRoleUrl,
} from './support/constants';

/**
 * Boots a real PostgreSQL 17 + PostGIS 3.5 and a real S3-compatible store for the
 * contract, integration, and privacy suites.
 *
 * Constitution III: "Integration tests against a real database ... an RLS policy is
 * only real when the real engine evaluates it." There is deliberately no mock path
 * here — a suite that can run without a database is a suite that proves nothing
 * about row-level security.
 *
 * Two connection strings come out of one container, exactly as in production
 * (research D-20): the owner's for migrations and fixtures, the API role's for
 * everything a request would do. The API role does not exist until the
 * migrations have run — `ensureMigrated()` in test/support/db.ts applies them
 * and installs the password below — but a connection string is only a string,
 * and nothing dials it before then.
 *
 * The object store is RustFS, the development store (research D-31), so the
 * upload and document suites exercise real signatures, `HeadObject` sizes and
 * round trips. Its data lives on a tmpfs: nothing a test writes outlives the run.
 *
 * The per-suite fixture (accounts A, B, C and their content) is built by the harness
 * in test/integration/harness.ts.
 */
export default async function globalSetup(): Promise<void> {
  const [postgres, rustfs] = await Promise.all([startPostgres(), startRustfs()]);

  const ownerUrl = postgres.getConnectionUri();
  process.env.MIGRATION_DATABASE_URL = ownerUrl;
  process.env.DATABASE_URL = apiRoleUrl(ownerUrl);
  process.env.API_DB_PASSWORD = API_ROLE_PASSWORD;

  const endpoint = `http://${rustfs.getHost()}:${rustfs.getMappedPort(9000)}`;
  await createBuckets(endpoint);
  process.env.S3_ENDPOINT = endpoint;
  process.env.S3_REGION = TEST_S3.region;
  process.env.S3_ACCESS_KEY_ID = TEST_S3.accessKeyId;
  process.env.S3_SECRET_ACCESS_KEY = TEST_S3.secretAccessKey;
  process.env.S3_BUCKET_PHOTOS = TEST_S3.buckets.photos;
  process.env.S3_BUCKET_DOCUMENTS = TEST_S3.buckets.documents;

  // Stash the handles so teardown can stop them.
  const handles = globalThis as Record<string, unknown>;
  handles.__PG_CONTAINER__ = postgres;
  handles.__S3_CONTAINER__ = rustfs;
}

function startPostgres() {
  return new PostgreSqlContainer('postgis/postgis:17-3.5')
    .withDatabase('triptrackr_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();
}

function startRustfs() {
  return (
    new GenericContainer(RUSTFS_IMAGE)
      .withEnvironment({
        RUSTFS_VOLUMES: '/data',
        RUSTFS_ADDRESS: '0.0.0.0:9000',
        RUSTFS_CONSOLE_ENABLE: 'false',
        RUSTFS_ACCESS_KEY: TEST_S3.accessKeyId,
        RUSTFS_SECRET_KEY: TEST_S3.secretAccessKey,
      })
      // World-writable: RustFS runs as UID 10001, and a tmpfs mounts root-owned.
      .withTmpFs({ '/data': 'rw,mode=1777' })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
      .start()
  );
}

/** Both private buckets, as `rustfs-init` creates them in development. No public policy. */
async function createBuckets(endpoint: string): Promise<void> {
  const client = new S3Client({
    endpoint,
    region: TEST_S3.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: TEST_S3.accessKeyId,
      secretAccessKey: TEST_S3.secretAccessKey,
    },
  });
  try {
    for (const bucket of Object.values(TEST_S3.buckets)) {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  } finally {
    client.destroy();
  }
}
