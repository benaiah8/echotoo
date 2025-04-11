import apiInstance from "../axios";
import { AxiosRequestConfig, AxiosResponse } from "axios";

interface GetRequestOptions extends AxiosRequestConfig {
  route: string;
  queryParams?: any;
  pathVariables?: Record<string, string>;
  authorizationType?: string;
}

export async function getRequest(
  options: GetRequestOptions
): Promise<AxiosResponse> {
  const { route, queryParams, pathVariables, authorizationType, cancelToken } =
    options;

  try {
    let modifiedRoute = route;

    const config = {
      params: queryParams,
      authorizationType,
      cancelToken: cancelToken,
    };

    if (pathVariables) {
      Object.entries(pathVariables).forEach(([key, value]) => {
        modifiedRoute = modifiedRoute.replace(`:${key}`, value);
      });
    }

    const response = await apiInstance.get(modifiedRoute, config);
    return response;
  } catch (error: any) {
    if (error.response) {
      return error.response;
    }
    return error;
  }
}
