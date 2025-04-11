import axios, { AxiosInstance } from "axios";
import { BASE_URL } from "../config/api.ts";

const apiInstance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
});

apiInstance.interceptors.request.use(
  async (config: any) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.data instanceof FormData) {
      config.headers["Content-Type"] = "multipart/form-data";
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default apiInstance;
