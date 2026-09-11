import { getPageSections } from '@/server-lib/sections-repo';
import OriginStoryPage from '@/views/OriginStoryPage';

/* The page's layout can be rearranged in the dashboard, so the saved sections
   are read here and rendered into the server response. Saving a layout calls
   revalidatePath on this route; the window below only matters if the table is
   edited out of band. With nothing saved this is the layout composed in code. */
export const revalidate = 300;

export default async function Page() {
  return <OriginStoryPage sections={await getPageSections('our-story')} />;
}
