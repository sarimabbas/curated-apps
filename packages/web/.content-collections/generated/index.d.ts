import configuration from "../../content-collections.ts";
import { GetTypeByName } from "@content-collections/core";

export type Blog = GetTypeByName<typeof configuration, "blog">;
export declare const allBlogs: Array<Blog>;

export type App = GetTypeByName<typeof configuration, "app">;
export declare const allApps: Array<App>;

export type Tag = GetTypeByName<typeof configuration, "tag">;
export declare const allTags: Array<Tag>;

export {};
