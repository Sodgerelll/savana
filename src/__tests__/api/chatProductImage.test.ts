import { describe, it, expect } from "vitest";
import { parseStoredImage } from "../../../api/chat/productImage";

/**
 * Product photos live in Firestore as `data:` URIs. The storefront renders
 * those inline and never noticed; Messenger fetches carousel images from its
 * own servers over https, so every card went out blank. These cover the seam
 * where a stored value becomes something Facebook can actually fetch.
 */

const PIXEL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

describe("parseStoredImage", () => {
  it("decodes a base64 data URI into bytes Facebook can be handed", () => {
    const image = parseStoredImage([PIXEL]);

    expect(image).toMatchObject({ kind: "bytes", contentType: "image/jpeg" });
    expect(image && "bytes" in image && image.bytes.length).toBeGreaterThan(0);
    // JPEG's magic number, so this is a real decode and not a string copy.
    expect(image && "bytes" in image && image.bytes[0]).toBe(0xff);
    expect(image && "bytes" in image && image.bytes[1]).toBe(0xd8);
  });

  it("serves an https photo from where it already lives", () => {
    // No reason to pull the bytes through this function twice.
    expect(parseStoredImage(["https://cdn.savana.mn/soap.jpg"])).toEqual({
      kind: "url",
      url: "https://cdn.savana.mn/soap.jpg",
    });
  });

  it("takes the first entry it can actually serve", () => {
    expect(parseStoredImage(["/uploads/soap.jpg", "blob:x", PIXEL])).toMatchObject({ kind: "bytes" });
  });

  it("reads the media type off the URI rather than assuming JPEG", () => {
    const png = parseStoredImage(["data:image/png;base64,iVBORw0KGgo="]);

    expect(png).toMatchObject({ kind: "bytes", contentType: "image/png" });
  });

  it("refuses a data URI that carries no bytes", () => {
    expect(parseStoredImage(["data:image/jpeg;base64,"])).toBeNull();
  });

  it("refuses anything Messenger could not fetch", () => {
    // http, relative paths and blob URLs all render as a broken card, which
    // Facebook shows as a card with no picture rather than an error.
    expect(parseStoredImage(["http://savana.mn/soap.jpg"])).toBeNull();
    expect(parseStoredImage(["/uploads/soap.jpg"])).toBeNull();
    expect(parseStoredImage(["blob:https://savana.mn/abc"])).toBeNull();
    expect(parseStoredImage(["data:text/html;base64,PGh0bWw+"])).toBeNull();
  });

  it("survives a products document with no usable images field", () => {
    expect(parseStoredImage(undefined)).toBeNull();
    expect(parseStoredImage([])).toBeNull();
    expect(parseStoredImage("not an array")).toBeNull();
    expect(parseStoredImage([null, 42, {}])).toBeNull();
  });
});
