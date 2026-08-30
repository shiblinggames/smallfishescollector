import { redirect } from 'next/navigation'

/**
 * THE FOLLOW LIST MOVED INTO THE TAVERN.
 *
 * It was a page of its own, reachable only from a menu, one link away from a
 * Tavern that had nothing in it — two doors onto two halves of the same idea.
 * The tavern is the social room now and this list is the middle of it.
 *
 * A REDIRECT RATHER THAN A DELETION. The address has existed for the life of
 * the game and is sitting in bookmarks, in a PWA shortcut and in old links;
 * those people should arrive in the room, not at a 404. `permanent` because it
 * is: the page is not coming back.
 *
 * The COMPONENTS stay where they are — `SocialClient`, `actions` and
 * `CrewSummarySheet` are imported by the tavern from this folder. Moving the
 * files would be churn for its own sake, and this folder is still honestly
 * "the social list", it simply no longer has a page of its own.
 */
export default async function SocialPage() {
  redirect('/tavern')
}
