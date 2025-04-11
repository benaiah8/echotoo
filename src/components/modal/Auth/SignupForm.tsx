import { useState } from "react";
import PrimaryInput from "../../input/PrimaryInput";

function SignupForm() {
  const [data, setData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    repeatPassword: "",
  });
  return (
    <div className="w-full flex flex-col ">
      <PrimaryInput
        label="Full name"
        placeholder="Enter your full name"
        value={data.name}
        onChange={(e) => setData({ ...data, name: e.target.value })}
      />
      <div className="mt-2"></div>
      <PrimaryInput
        label="Username"
        placeholder="Select your username"
        value={data.username}
        onChange={(e) => setData({ ...data, username: e.target.value })}
      />
      <div className="mt-2"></div>
      <PrimaryInput
        label="Email"
        type="email"
        placeholder="Enter your email address"
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
      <div className="mt-2"></div>
      <PrimaryInput
        label="Repeat password"
        placeholder="Enter your password again"
        type="password"
        value={data.repeatPassword}
        onChange={(e) => setData({ ...data, repeatPassword: e.target.value })}
      />
    </div>
  );
}

export default SignupForm;
