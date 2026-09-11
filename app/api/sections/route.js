import { revalidatePath } from 'next/cache';
import { pool, dbUnavailableResponse } from '@/server-lib/db';
import { requireAdmin } from '@/server-lib/session';
import { getPageSections, savePageSections, resetPageSections } from '@/server-lib/sections-repo';
import { findPage } from '@/lib/blocks/pages';
import { BLOCK_SCHEMA } from '@/lib/blocks/schema';

export const dynamic = 'force-dynamic';

const LANGS = ['en', 'ne'];

/** Reject anything that isn't a shape the renderer knows how to draw. */
function validate(sections) {
  if (!Array.isArray(sections)) throw new Error('Sections must be a list.');
  if (sections.length > 60) throw new Error('That is more sections than a page can hold.');

  return sections.map((section) => {
    const type = String(section?.type || '');
    if (type === 'builtin') {
      const key = String(section?.data?.key || '');
      if (!key) throw new Error('A built-in section is missing its key.');
      return {
        type,
        visible: section.visible !== false,
        label: section.label ? String(section.label).slice(0, 80) : null,
        data: { key },
      };
    }

    const def = BLOCK_SCHEMA[type];
    if (!def) throw new Error(`Unknown section type "${type}".`);

    // Only the fields this block declares are stored, so the saved data can
    // never grow keys the renderer doesn't read.
    const data = {};
    for (const lang of LANGS) {
      const incoming = section?.data?.[lang];
      if (!incoming || typeof incoming !== 'object') continue;
      const copy = {};
      for (const field of def.fields) {
        if (incoming[field.name] !== undefined) copy[field.name] = incoming[field.name];
      }
      data[lang] = copy;
    }

    return {
      type,
      visible: section.visible !== false,
      label: section.label ? String(section.label).slice(0, 80) : null,
      data,
    };
  });
}

export async function GET(request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  if (!pool) return dbUnavailableResponse();

  const page = new URL(request.url).searchParams.get('page') || '';
  const definition = findPage(page);
  if (!definition) return Response.json({ error: 'Unknown page.' }, { status: 404 });

  const sections = await getPageSections(page, { includeHidden: true });
  return Response.json({ page, sections, customised: sections.length > 0 });
}

export async function PUT(request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  if (!pool) return dbUnavailableResponse();

  const body = await request.json().catch(() => ({}));
  const definition = findPage(body?.page);
  if (!definition) return Response.json({ error: 'Unknown page.' }, { status: 404 });

  let clean;
  try {
    clean = validate(body.sections);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  try {
    const sections = await savePageSections(definition.key, clean);
    revalidatePath(definition.path);
    return Response.json({ page: definition.key, sections, customised: true });
  } catch (e) {
    console.error('[sections:save]', e.message);
    return Response.json({ error: 'Could not save this layout.' }, { status: 500 });
  }
}

/** Reset: drop the saved layout so the page renders the one composed in code. */
export async function DELETE(request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  if (!pool) return dbUnavailableResponse();

  const page = new URL(request.url).searchParams.get('page') || '';
  const definition = findPage(page);
  if (!definition) return Response.json({ error: 'Unknown page.' }, { status: 404 });

  try {
    await resetPageSections(definition.key);
    revalidatePath(definition.path);
    return Response.json({ page: definition.key, sections: [], customised: false });
  } catch (e) {
    console.error('[sections:reset]', e.message);
    return Response.json({ error: 'Could not reset this page.' }, { status: 500 });
  }
}
