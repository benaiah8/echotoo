import queryString from "query-string";

export const URLencode = (params: any): string => {
  const filteredParams = Object.fromEntries(
    Object.entries(params).filter(
      ([_, value]) => value !== undefined && value !== ""
    )
  );

  return queryString.stringify(filteredParams);
};

export const URLdecode = (): any => {
  const qString = window.location.search;

  let params = queryString.parse(qString) as any;

  return params;
};
