import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { Paths } from "./Paths";
import HomePage from "../pages/HomePage";
import CreatePage from "../pages/CreatePage";
import CreateTitlePage from "../pages/CreateTitlePage";
import ExperiencePage from "../pages/ExperiencePage";
import NotificationPage from "../pages/NotificationPage";

function AppRouter() {
  return (
    <Router>
      <div className="w-full min-h-screen flex flex-col relative">
        <Routes>
          <Route path={Paths.home} Component={HomePage} />
          <Route path={Paths.create} Component={CreatePage} />
          <Route path={Paths.createTitle} Component={CreateTitlePage} />
          <Route path={Paths.experience} Component={ExperiencePage} />
          <Route path={Paths.notification} Component={NotificationPage} />
        </Routes>
      </div>
    </Router>
  );
}

export default AppRouter;
