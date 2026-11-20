export type UntilPhase = "armed" | "checking" | "paused";

export type UntilEnd = "passed" | "stopped" | "capped";

export interface UntilState {
  check: string;
  round: number;
  rounds: number;
  phase: UntilPhase;
  failing?: number;
  since?: number;
}

export interface UntilEndNotice {
  state: UntilState;
  end: UntilEnd;
  text: string;
}
