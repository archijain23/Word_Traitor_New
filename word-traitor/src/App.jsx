import Button from "./components/ui/Button";
import Card from "./components/ui/Card";

export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="p-6 space-y-4">
        <h1 className="text-2xl font-bold text-cyan-400">
          Word Traitor UI Base
        </h1>

        <Button>Test Button</Button>
      </Card>
    </div>
  );
}