import "./App.css";
import GlobalErrorHandler from "./wrappers/GlobalErrorHandler";
import AppRouter from "./router/AppRouter";

function App() {
  return (
    <GlobalErrorHandler>
      <AppRouter />
    </GlobalErrorHandler>
  );
}

export default App;
