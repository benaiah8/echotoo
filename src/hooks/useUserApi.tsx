import { Register } from "../api/services/user";

export interface UserPayloadInterface {
  email: string;
  password: string;
  repeatPassword?: string;
  username: string;
  fullName: string;
}

export default function useUserApi() {
  const registerUser = async ({
    setLoading,
    data,
  }: {
    setLoading: (loading: boolean) => void;
    data: any;
  }) => {
    console.log({ data });
    const res = await Register({ setLoading, payload: data });
  };

  return { registerUser };
}
