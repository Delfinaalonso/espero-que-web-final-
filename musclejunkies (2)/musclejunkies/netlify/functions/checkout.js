// netlify/functions/checkout.js
// Crea una preferencia de pago en Mercado Pago
//
// Variables de entorno en Netlify:
//   MP_ACCESS_TOKEN  → Token de acceso de MP (Panel MP → Credenciales → Producción)
//   SITE_URL         → URL del sitio (https://musclejunkies.netlify.app)

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const SITE_URL = process.env.SITE_URL || 'https://musclejunkies.netlify.app';

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!MP_ACCESS_TOKEN) return { statusCode: 500, body: JSON.stringify({ error: 'MP_ACCESS_TOKEN no configurado' }) };

  let items, customer;
  try {
    const body = JSON.parse(event.body || '{}');
    items = body.items;
    customer = body.customer || {};
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'items requerido' }) };
    }
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  try {
    // Crear preferencia de pago en MP
    const preference = {
      items: items.map(item => ({
        id: item.variantId,
        title: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        currency_id: 'ARS',
      })),
      payer: customer.email ? {
        email: customer.email,
        name: customer.name || '',
      } : undefined,
      back_urls: {
        success: `${SITE_URL}?pago=exitoso`,
        failure: `${SITE_URL}?pago=fallido`,
        pending: `${SITE_URL}?pago=pendiente`,
      },
      auto_return: 'approved',
      notification_url: `${SITE_URL}/.netlify/functions/webhook-mp`,
      metadata: {
        items: JSON.stringify(items),
        customer: JSON.stringify(customer),
      },
    };

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`MP error ${res.status}: ${err}`);
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      // init_point = URL de pago de producción
      // sandbox_init_point = URL de pago de pruebas
      body: JSON.stringify({ checkoutUrl: data.init_point }),
    };
  } catch (err) {
    console.error('MP checkout error:', err);
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
