import { redirect } from 'next/navigation';

/**
 * Whiteboard lives on My Day as a floating action (Jensen: think on the board
 * next to today’s work — not as a separate nav destination).
 */
export default function WhiteboardPage() {
  redirect('/my-day?board=1');
}
