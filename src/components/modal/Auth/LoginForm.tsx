import React, { useState } from "react";
import PrimaryInput from "../../input/PrimaryInput";
import { UserPayloadInterface } from "../../../hooks/useUserApi";

interface LoginFormProps {
  data: UserPayloadInterface;
  setData: (data: UserPayloadInterface) => void;
}

function LoginForm({ data, setData }: LoginFormProps) {
  return (
    <div className="w-full flex flex-col ">
      <PrimaryInput
        label="Email/Username"
        placeholder="Enter your email or username"
        value={data.email}
        onChange={(e) => setData({ ...data, email: e.target.value })}
      />
      <div className="mt-2"></div>
      <PrimaryInput
        label="Password"
        placeholder="Enter your password"
        type="password"
        value={data.password}
        onChange={(e) => setData({ ...data, password: e.target.value })}
      />
    </div>
  );
}

export default LoginForm;
