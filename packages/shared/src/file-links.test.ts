import { describe, expect, test } from "bun:test";
import {
  normalizeRepoIdForWeb,
  rewriteLocalFileHref,
  rewriteMarkdownLocalFileLinks,
  rewriteMarkdownLocalFileLinksDeep,
} from "./file-links";

describe("file links", () => {
  test("normalizes common SSH host aliases for web links", () => {
    expect(normalizeRepoIdForWeb("github.com-agentlogs/agentlogs/agentlogs")).toBe("github.com/agentlogs/agentlogs");
  });

  test("rewrites local filesystem links to GitHub blob URLs", () => {
    expect(
      rewriteLocalFileHref("/Users/philipp/dev/agentlogs/packages/cli/src/lib/perform-upload.ts#L45", {
        repoId: "github.com-agentlogs/agentlogs/agentlogs",
        branch: "main",
      }),
    ).toBe("https://github.com/agentlogs/agentlogs/blob/main/packages/cli/src/lib/perform-upload.ts#L45");
  });

  test("rewrites markdown file links and strips unrewriteable local links", () => {
    expect(
      rewriteMarkdownLocalFileLinks(
        "Updated [perform-upload.ts](/Users/philipp/dev/agentlogs/packages/cli/src/lib/perform-upload.ts#L45).",
        {
          repoId: "github.com-agentlogs/agentlogs/agentlogs",
          branch: "main",
        },
      ),
    ).toBe(
      "Updated [perform-upload.ts](https://github.com/agentlogs/agentlogs/blob/main/packages/cli/src/lib/perform-upload.ts#L45).",
    );

    expect(
      rewriteMarkdownLocalFileLinks("See [notes](/Users/philipp/Documents/private-notes.md).", {
        repoId: "github.com-agentlogs/agentlogs/agentlogs",
        branch: "main",
      }),
    ).toBe("See notes.");
  });

  test("rewrites markdown links recursively across nested transcript data", () => {
    const input = {
      messages: [
        {
          type: "agent",
          text: "Updated [perform-upload.ts](/Users/philipp/dev/agentlogs/packages/cli/src/lib/perform-upload.ts#L45).",
        },
        {
          type: "tool-call",
          output: {
            content: "See [notes](/Users/philipp/Documents/private-notes.md).",
          },
        },
      ],
    };

    expect(
      rewriteMarkdownLocalFileLinksDeep(input, {
        repoId: "github.com-agentlogs/agentlogs/agentlogs",
        branch: "main",
      }),
    ).toEqual({
      messages: [
        {
          type: "agent",
          text: "Updated [perform-upload.ts](https://github.com/agentlogs/agentlogs/blob/main/packages/cli/src/lib/perform-upload.ts#L45).",
        },
        {
          type: "tool-call",
          output: {
            content: "See notes.",
          },
        },
      ],
    });
  });
});
