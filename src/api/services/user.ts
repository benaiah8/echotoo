import { AxiosResponse } from "axios";
import { Requests } from "../../config/api.ts";
import { postRequest } from "../commonActions/post";

export const Register = async ({ setLoading, payload }: any): Promise<any> => {
  try {
    setLoading && setLoading(true);
    const response: AxiosResponse = await postRequest({
      route: Requests.post.register,
      payload: payload,
    });
    setLoading && setLoading(false);

    const status = response?.status;
    const user = response?.data?.data?.user;
    const token = response?.data?.data?.token;
    const message = response?.data?.message;
    const error = response?.data?.error;

    console.log({ user, token });

    return {
      status: status,
      message: message,
      user,
      token,
      error,
    };
  } catch (error) {
    setLoading && setLoading(false);
    throw error;
  }
};
