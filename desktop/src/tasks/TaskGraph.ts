import { Dag } from "@ts-dag/builder";

const dag = new Dag<{ value: number }>();
const fetchDataA = dag.task("fetchDataA", () => {
  console.log("kicking off fetchDataA");
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ value: 10 });
    }, 5000);
  });
});

const fetchDataB = dag.task("fetchDataB", () => {
  console.log("kicking off fetchDataB");
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ value: 20 });
    }, 5000);
  });
});

const processData = dag.task(
  "processData",
  async (ctx) => {
    const dataA = fetchDataA.output; // Access output of fetchData
    const dataB = fetchDataB.output; // Access output of fetchData
    console.log("processData", dataA.value, dataB.value);
    return { value: dataA.value + dataB.value };
  },
  [fetchDataA, fetchDataB]
);

dag.task(
  "processDataLeaf",
  async (ctx) => {
    return { value: 1 };
  },
  []
);
export const runTaskGraph = async () => {
  console.log({ DAG: dag }, dag.topologicalSort());
  await dag.run();
};
