import { redirect } from 'next/navigation';

/** Whiteboard removed from the product — send people to My Day. */
export default function WhiteboardPage() {
  redirect('/my-day');
}
