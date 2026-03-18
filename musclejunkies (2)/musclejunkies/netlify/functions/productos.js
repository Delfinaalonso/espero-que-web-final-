// netlify/functions/productos.js
// Lee productos desde Supabase y los mapea al formato del frontend

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

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Configuración de API incompleta' }) };
  }

  try {
    const [products, variants] = await Promise.all([
      supabaseGet('/products?visible=eq.true&order=category.asc,name.asc&select=*'),
      supabaseGet('/variants?select=*'),
    ]);

    // Agrupar variantes por producto
    const variantsByProduct = {};
    for (const v of variants) {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    }

    const mapped = products.map(p => {
      const pvariants = variantsByProduct[p.id] || [];
      const flavors = pvariants.map(v => v.flavor).filter(Boolean);

      // Dosage: viene como columnas separadas en Supabase
      let dosage = null;
      if (p.dosage_amount || p.dosage_when || p.dosage_how) {
        dosage = {
          amount: p.dosage_amount || '',
          when:   p.dosage_when   || '',
          how:    p.dosage_how    || '',
        };
      }

      return {
        id:            p.id,
        slug:          p.slug,
        name:          p.name,
        category:      p.category,
        price:         p.price,
        originalPrice: p.original_price || null,
        rating:        5.0,
        reviews:       0,
        featured:      p.featured === true,
        visible:       p.visible  === true,
        flavors:       flavors.length > 0 ? flavors : null,
        // Campos estructurados — vienen como JSON de Supabase directamente
        description:     p.description     || '',
        benefits:        p.benefits        || [],
        ingredients:     p.ingredients     || null,
        dosage,
        idealFor:        p.ideal_for       || null,
        supplementFacts: p.supplement_facts || null,
        faq:             p.faq             || null,
        imageUrl:        p.image_url       || null,
        variantId:       pvariants[0]?.id  || p.id,
        variants: pvariants.map(v => ({
          id:     v.id,
          flavor: v.flavor,
          price:  v.price || p.price,
          stock:  v.stock,
        })),
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=120',
      },
      body: JSON.stringify(mapped),
    };
  } catch (err) {
    console.error('Supabase error:', err);
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
