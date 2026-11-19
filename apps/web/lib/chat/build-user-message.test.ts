import { describe, expect, test } from "bun:test";
import { buildUserMessageFromComposerPayload } from "./build-user-message";

describe("buildUserMessageFromComposerPayload", () => {
  test("builds text and file parts when payload uses { text, files }", () => {
    const message = buildUserMessageFromComposerPayload(
      {
        text: "Investigate this bug",
        files: [
          {
            type: "file",
            mediaType: "image/png",
            url: "https://example.com/img.png",
          },
        ],
      },
      "msg-1",
    );

    expect(message).toEqual({
      id: "msg-1",
      role: "user",
      parts: [
        { type: "text", text: "Investigate this bug" },
        {
          type: "file",
          mediaType: "image/png",
          url: "https://example.com/img.png",
        },
      ],
    });
  });

  test("omits empty text part when only files are attached", () => {
    const message = buildUserMessageFromComposerPayload(
      {
        text: "",
        files: [
          {
            type: "file",
            mediaType: "image/png",
            url: "https://example.com/img.png",
          },
        ],
      },
      "msg-2",
    );

    expect(message.parts).toEqual([
      {
        type: "file",
        mediaType: "image/png",
        url: "https://example.com/img.png",
      },
    ]);
  });

  test("preserves parts directly when payload uses { parts }", () => {
    const message = buildUserMessageFromComposerPayload(
      {
        parts: [
          { type: "text", text: "Check snippet" },
          {
            type: "data-snippet",
            id: "snip-1",
            data: { filename: "notes.txt", content: "hello" },
          },
        ],
      },
      "msg-3",
    );

    expect(message).toEqual({
      id: "msg-3",
      role: "user",
      parts: [
        { type: "text", text: "Check snippet" },
        {
          type: "data-snippet",
          id: "snip-1",
          data: { filename: "notes.txt", content: "hello" },
        },
      ],
    });
  });
});
