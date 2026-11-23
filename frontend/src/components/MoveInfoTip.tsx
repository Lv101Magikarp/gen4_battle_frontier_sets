import { typeColor } from "../theme";
import type { MoveData } from "../engine/damage";

// Hover card with a move's Gen IV details (power / accuracy / side effect). Render
// it as the last child of a `position: relative` element that carries the
// `.has-movetip` class; CSS reveals it on hover/focus of that parent.
export function MoveInfoTip({ move }: { move: MoveData }) {
  const power = move.basePower ?? "—";
  const accuracy = move.accuracy == null ? "—" : `${move.accuracy}%`;
  const pp = move.pp ?? "—";
  return (
    <span className="movetip" role="tooltip">
      <span className="movetip__head" style={{ color: typeColor(move.type) }}>
        {move.name}
      </span>
      <span className="movetip__grid">
        <span className="movetip__k">Type</span>
        <span className="movetip__v">{move.type}</span>
        <span className="movetip__k">Class</span>
        <span className="movetip__v">{move.category}</span>
        <span className="movetip__k">Power</span>
        <span className="movetip__v">{power}</span>
        <span className="movetip__k">Acc</span>
        <span className="movetip__v">{accuracy}</span>
        <span className="movetip__k">PP</span>
        <span className="movetip__v">{pp}</span>
      </span>
      {move.effect && <span className="movetip__effect">{move.effect}</span>}
    </span>
  );
}
