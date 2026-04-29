import { Route, Switch } from "wouter";

function Home() {
  return <main className="min-h-screen flex items-center justify-center bg-zinc-50">
    <h1 className="text-3xl font-bold">DealSense</h1>
  </main>;
}

function Run() {
  return <main className="min-h-screen p-8 bg-zinc-50">Run page placeholder</main>;
}

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/runs/:id" component={Run} />
    </Switch>
  );
}
