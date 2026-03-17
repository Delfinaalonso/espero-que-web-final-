// netlify/functions/productos.js
// Lee productos desde Supabase
//
// Variables de entorno en Netlify:
//   SUPABASE_URL          → https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  → service role key

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res.json();
}

function parseDescription(raw) {
  if (!raw) return { description: '', benefits: [], ingredients: null, dosage: null, idealFor: null, supplementFacts: null, faq: null };
  const text = raw.replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n').replace(/<\/li>/gi,'\n').replace(/<li[^>]*>/gi,'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\r\n/g,'\n').trim();
  const sections = {};
  let cur = '__intro__';
  sections[cur] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]{2,}):$/);
    if (match) { cur = match[1].trim(); sections[cur] = []; }
    else { (sections[cur] = sections[cur] || []).push(line); }
  }
  const ls = (key) => { const k = Object.keys(sections).find(k => k.startsWith(key)); return k ? sections[k].filter(Boolean) : []; };
  const description = (sections['__intro__'] || []).join(' ').slice(0, 400);
  const benefits = ls('BENEFICIO').slice(0, 6);
  const ingredients = ls('INGREDIENTE').map(l => { const p = l.split('|').map(s => s.trim()); return { name: p[0]||'', dose: p[1]||'', desc: p[2]||'' }; }).filter(i => i.name);
  let dosage = null;
  const dl = ls('DOSIFICACI');
  if (dl.length > 0) {
    const get = (pfx) => { const l = dl.find(l => l.toLowerCase().startsWith(pfx.toLowerCase())); return l ? l.replace(/^[^:]+:\s*/i,'').trim() : ''; };
    dosage = { amount: get('Cantidad')||get('Dosis')||dl[0]||'', when: get('Cuándo')||get('Cuando')||dl[1]||'', how: get('Cómo')||get('Como')||dl[2]||'' };
    if (!dosage.amount && !dosage.when && !dosage.how) dosage = null;
  }
  const idealFor = ls('IDEAL').slice(0, 6);
  const supplementFacts = ls('DATO').join(' ') || ls('NUTRICIONAL').join(' ') || null;
  const faq = ls('FAQ').map(l => { const i = l.indexOf('|'); return i === -1 ? null : { q: l.slice(0,i).trim(), a: l.slice(i+1).trim() }; }).filter(Boolean);
  return { description, benefits, ingredients: ingredients.length>0?ingredients:null, dosage, idealFor: idealFor.length>0?idealFor:null, supplementFacts:supplementFacts||null, faq:faq.length>0?faq:null };
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'Configuración de API incompleta' }) };

  try {
    const [products, variants] = await Promise.all([
      supabaseGet('/products?visible=eq.true&order=category.asc,name.asc&select=*'),
      supabaseGet('/variants?select=*'),
    ]);

    const variantsByProduct = {};
    for (const v of variants) {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    }

    const mapped = products.map(p => {
      const pvariants = variantsByProduct[p.id] || [];
      const flavors = pvariants.map(v => v.flavor).filter(Boolean);
      const parsed = parseDescription(p.description);
      return {
        id: p.id, slug: p.slug, name: p.name, category: p.category,
        price: p.price, originalPrice: p.original_price || null,
        rating: 5.0, reviews: 0, featured: p.featured, visible: p.visible,
        flavors: flavors.length > 0 ? flavors : null,
        description: parsed.description, benefits: parsed.benefits,
        ingredients: parsed.ingredients, dosage: parsed.dosage,
        idealFor: parsed.idealFor, supplementFacts: parsed.supplementFacts, faq: parsed.faq,
        imageUrl: p.image_url || null,
        variantId: pvariants[0]?.id || p.id,
        variants: pvariants.map(v => ({ id: v.id, flavor: v.flavor, price: v.price || p.price, stock: v.stock })),
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15, s-maxage=30' },
      body: JSON.stringify(mapped),
    };
  } catch (err) {
    console.error('Supabase error:', err);
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
