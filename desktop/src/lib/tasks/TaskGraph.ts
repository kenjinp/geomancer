import { Dag } from "@ts-dag/builder";

export class TaskGraph<ContextType> {
  private dag: Dag<ContextType>;
  constructor(private context: ContextType) {
    this.dag = new Dag();
    this.dag.useContext(this.context);
    // this.dag.useState(this.context);
  }

  graph() {
    return this.dag.topologicalSort();
  }

  public async run() {
    await this.dag.run();
  }
}
