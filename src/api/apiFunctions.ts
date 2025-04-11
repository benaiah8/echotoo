import { QueryParamsProps } from "../declarations/commonServices";

export const GetQueryVariables = ({
  limit,
  q,
  skip,
  type,
  callback_url,
  departureDate,
  destination,
  oneWay,
  origin,
}: QueryParamsProps): QueryParamsProps => {
  let queryParams: QueryParamsProps = {};

  if (limit) queryParams.limit = limit;
  if (q) queryParams.q = q;
  if (skip) queryParams.skip = skip;
  if (type) queryParams.type = type;
  if (callback_url) queryParams.callback_url = callback_url;
  if (departureDate) queryParams.departureDate = departureDate;
  if (destination) queryParams.destination = destination;
  if (oneWay) queryParams.oneWay = oneWay;
  if (origin) queryParams.origin = origin;

  return queryParams;
};
