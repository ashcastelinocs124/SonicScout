import { Route, Switch } from "wouter";
import { Home } from "./pages/Home";
import { Run } from "./pages/Run";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/runs/:id" component={Run} />
      <Route><div className="p-8">404</div></Route>
    </Switch>
  );
}
