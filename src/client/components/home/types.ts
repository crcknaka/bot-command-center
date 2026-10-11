/** A group the bot sits in — what the chat management cards act on */
export interface HomeChat {
  chatId: string;
  title: string;
  botId: number;
  botName: string;
  botRunning: boolean;
}

export interface ChatUser {
  userId: number;
  userName: string;
  username: string | null;
}
