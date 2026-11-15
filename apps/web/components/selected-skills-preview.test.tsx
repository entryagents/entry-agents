import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectedSkillsPreview } from "./selected-skills-preview";

describe("SelectedSkillsPreview", () => {
  test("renders nothing when skills list is empty", () => {
    const html = renderToStaticMarkup(
      <SelectedSkillsPreview skills={[]} onRemove={() => {}} />,
    );
    expect(html).toBe("");
  });

  test("renders scrollable card with selected skills, kind badges, and descriptions", () => {
    const html = renderToStaticMarkup(
      <SelectedSkillsPreview
        skills={[
          {
            name: "unslop",
            description: "Polish UI with spacing, color, and type passes",
            source: "skill",
          },
          {
            name: "team",
            description: "Coordinate parallel specialist subagents",
            source: "team",
          },
        ]}
        onRemove={() => {}}
      />,
    );

    expect(html).toContain("/unslop");
    expect(html).toContain("/team");
    expect(html).toContain("Skill");
    expect(html).toContain("Team mode");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("Remove /unslop");
  });
});
