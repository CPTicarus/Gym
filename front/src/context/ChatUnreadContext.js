import { createContext } from "react";

export const ChatUnreadContext = createContext({ refreshChatUnread: () => {}, isDrawerOpen: false });
