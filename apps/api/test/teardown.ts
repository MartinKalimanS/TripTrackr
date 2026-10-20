import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedTestContainer } from 'testcontainers';

export default async function globalTeardown(): Promise<void> {
  const handles = globalThis as Record<string, unknown>;
  const postgres = handles.__PG_CONTAINER__ as StartedPostgreSqlContainer | undefined;
  const rustfs = handles.__S3_CONTAINER__ as StartedTestContainer | undefined;
  await Promise.all([postgres?.stop(), rustfs?.stop()]);
}
