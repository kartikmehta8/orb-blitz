/**
 * @file Ask tab: chat with Orb, the Monad agent, from inside the app.
 *
 * Same agent, checks and review cards as the floating orb's sheet. With no
 * captured screen, "Paste from clipboard" gives Orb something to look at.
 */
import { AskSheet } from '../ask';

/**
 * Ask screen.
 * @returns The full-page chat.
 */
export default function ChatScreen() {
  return <AskSheet ctxId={undefined} page inApp />;
}
