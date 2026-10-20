import type { MessageProps } from "@yike-design/ui/es/components/message/src/message";

type LinBlogMessageOptions = MessageProps & {
  type: "primary" | "success" | "warning" | "error" | "loading";
};

declare module "vue" {
  interface ComponentCustomProperties {
    $message: (options: LinBlogMessageOptions) => unknown;
    $notification: unknown;
  }
}

export {};
