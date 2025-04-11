import apiInstance from "../axios";
import { AxiosResponse } from "axios";

interface PutRequestOptions {
  route: string;
  payload?: any;
  queryParams?: any;
  pathVariables?: Record<string, string>;
  formData?: boolean;
  authorizationType?: string;
}

interface PatchRequestOptions {
  route: string;
  payload?: any;
  queryParams?: any;
  pathVariables?: Record<string, string>;
  authorizationType?: string;
}

export async function putRequest(
  options: PutRequestOptions
): Promise<AxiosResponse> {
  const {
    route,
    payload,
    queryParams,
    pathVariables,
    formData,
    authorizationType,
  } = options;

  try {
    let modifiedRoute = route;

    const config: any = {
      params: queryParams,
      authorizationType,
    };

    if (pathVariables) {
      Object.entries(pathVariables).forEach(([key, value]) => {
        modifiedRoute = modifiedRoute.replace(`:${key}`, value);
      });
    }

    if (formData) {
      const formDataPayload = new FormData();

      if (payload) {
        Object.entries(payload).forEach(([key, value]) => {
          formDataPayload.append(key, value as any);
        });
      }
      config.headers = {
        "Content-Type": "multipart/form-data",
      };

      const response = await apiInstance.put(
        modifiedRoute,
        formDataPayload,
        config
      );
      return response;
    } else {
      const response = await apiInstance.put(modifiedRoute, payload, config);
      return response;
    }
  } catch (error: any) {
    if (error.response) {
      return error.response;
    }
    return error;
  }
}

export async function patchRequest(
  options: PatchRequestOptions
): Promise<AxiosResponse> {
  const { route, payload, queryParams, pathVariables, authorizationType } =
    options;

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

    const response = await apiInstance.patch(modifiedRoute, payload, config);
    return response;
  } catch (error: any) {
    if (error.response) {
      return error.response;
    }
    return error;
  }
}
