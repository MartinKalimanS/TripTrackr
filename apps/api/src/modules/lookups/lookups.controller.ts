import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  CitiesQuery,
  CitiesResponse,
  CountriesResponse,
  CountryId,
} from '@triptrackr/contracts';
import { z } from 'zod';

import { Public } from '@/common/auth/jwt.guard';
import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { LookupsService } from './lookups.service';

/** Route parameters arrive as strings; the contract's id is an integer. */
const CountryIdParam = z.coerce.number().pipe(CountryId);

/**
 * `/countries` (rest-api.md §11; FR-014). Access rule: public.
 *
 * `@Public()` on the class: there is no owner here, and the city picker must
 * work before a traveller has an account — sign-up flows into trip creation
 * without a pause. The default rate ceiling still applies.
 *
 * The country list changes when the catalogue is re-imported, which is rare
 * and deliberate, so it is cacheable for a day. The city search is not
 * cached: it is a typed prefix, and every keystroke is a different query.
 */
@Public()
@Controller('countries')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=86400')
  async countries(): Promise<CountriesResponse> {
    return respond(CountriesResponse, { countries: await this.lookups.countries() });
  }

  /** `?q=` autocomplete, accent-tolerant, ranked by prominence; top cities without `q`. */
  @Get(':id/cities')
  async cities(
    @Param('id', new ZodValidationPipe(CountryIdParam)) countryId: number,
    @Query(new ZodValidationPipe(CitiesQuery)) query: CitiesQuery,
  ): Promise<CitiesResponse> {
    return respond(CitiesResponse, {
      cities: await this.lookups.cities(countryId, query),
    });
  }
}
