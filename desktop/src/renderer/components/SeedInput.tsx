import { Button, Input } from "@nextui-org/react";
import Rand from "rand-seed";
import { useState } from "react";
import { useStore } from "zustand";

import store, { setState } from "@/state/Context";

export const SeedInput: React.FC = () => {
  const state = useStore(store);
  const [seed, setSeed] = useState<string>(state.random.seed.toString());

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setState({
      random: {
        seed: parseInt(seed),
        seededRandom: new Rand(seed),
      },
    });
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-row gap-2">
      <Input
        className="w-[50%]"
        size="sm"
        type="number"
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
      />
      <Button type="submit" size="sm" className="w-[50%]">
        Set Seed
      </Button>
    </form>
  );
};
