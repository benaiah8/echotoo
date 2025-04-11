import apiInstance from "../axios";
import { AxiosResponse } from "axios";

interface DeleteRequestOptions {
  route: string;
  queryParams?: any;
  pathVariables?: Record<string, string>;
  authorizationType?: string;
}

export async function deleteRequest(
  options: DeleteRequestOptions
): Promise<AxiosResponse> {
  const { route, queryParams, pathVariables, authorizationType } = options;

  try {
    let modifiedRoute = route;

    const config = {
      params: queryParams,
      authorizationType,
    };

    if (pathVariables) {
      Object.entries(pathVariables).forEach(([key, value]) => {
        modifiedRoute = modifiedRoute.replace(`:${key}`, value);
      });
    }

    const response = await apiInstance.delete(modifiedRoute, config);
    return response;
  } catch (error: any) {
    if (error.response) {
      return error.response;
    }
    return error;
  }
}
