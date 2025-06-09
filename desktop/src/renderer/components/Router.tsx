import { Button } from "@nextui-org/react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { Flat } from "../views/Flat/Flat";
import { Home } from "../views/Home/Home";

/**
 * Navigation component for switching between views
 */
export const NavigationBar: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex gap-2 p-1 backdrop-blur-sm rounded">
      <Button
        className="h-7"
        size="sm"
        variant="ghost"
        onPress={() => navigate("/")}
      >
        Globe Mode
      </Button>
      <Button
        className="h-7"
        size="sm"
        variant="ghost"
        onPress={() => navigate("/flat")}
      >
        Flat (Regional) Mode
      </Button>
    </div>
  );
};

/**
 * Router component handling the application routes
 */
export const AppRouter: React.FC = () => {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/flat" element={<Flat />} />
      </Routes>
    </>
  );
};
