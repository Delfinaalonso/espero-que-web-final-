// netlify/functions/webhook-mp.js
// Recibe notificaciones de Mercado Pago cuando se confirma un pago
// Actualiza stock en Supabase y crea el pedido
//
// Variables de entorno:
//   MP_ACCESS_TOKEN      → Token de MP
//   SUPABASE_URL         → https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY → service role key

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY;

async function supabase(path, method = 'GET', body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204) throw new Error(`Supabase ${method} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

exports.handler = async function(event) {
  // MP envía GET para verificar el endpoint y POST para notificar
  if (event.httpMethod === 'GET') return { statusCode: 200, body: 'OK' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const notification = JSON.parse(event.body || '{}');

    // Solo procesar notificaciones de pagos aprobados
    if (notification.type !== 'payment') return { statusCode: 200, body: 'ignored' };

    const paymentId = notification.data?.id;
    if (!paymentId) return { statusCode: 200, body: 'no payment id' };

    // Obtener detalles del pago desde MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!mpRes.ok) throw new Error(`MP payment fetch error ${mpRes.status}`);
    const payment = await mpRes.json();

    // Solo procesar pagos aprobados
    if (payment.status !== 'approved') {
      console.log(`Pago ${paymentId} status: ${payment.status} — ignorado`);
      return { statusCode: 200, body: 'not approved' };
    }

    // Extraer metadata (items y customer que mandamos al crear la preferencia)
    const metadata = payment.metadata || {};
    const items = JSON.parse(metadata.items || '[]');
    const customer = JSON.parse(metadata.customer || '{}');

    if (items.length === 0) {
      console.error('No items en metadata del pago', paymentId);
      return { statusCode: 200, body: 'no items' };
    }

    // 1. Crear o actualizar customer
    let customerId = null;
    if (customer.email) {
      const existing = await supabase(`/customers?email=eq.${encodeURIComponent(customer.email)}&select=id`);
      if (existing && existing.length > 0) {
        customerId = existing[0].id;
        // Actualizar totales
        await supabase(`/customers?id=eq.${customerId}`, 'PATCH', {
          total_orders: existing[0].total_orders + 1,
        });
      } else {
        const created = await supabase('/customers', 'POST', {
          email: customer.email,
          name: customer.name || '',
          phone: customer.phone || '',
          address: customer.address || '',
          city: customer.city || '',
          total_orders: 1,
          total_spent: payment.transaction_amount || 0,
        });
        customerId = created?.[0]?.id;
      }
    }

    // 2. Crear el pedido
    const total = payment.transaction_amount || items.reduce((s, i) => s + i.price * i.quantity, 0);
    const order = await supabase('/orders', 'POST', {
      customer_id: customerId,
      mp_payment_id: String(paymentId),
      status: 'approved',
      total,
      shipping_name: customer.name || '',
      shipping_address: customer.address || '',
      shipping_city: customer.city || '',
    });
    const orderId = order?.[0]?.id;

    // 3. Crear order_items y descontar stock
    for (const item of items) {
      // Insertar order_item
      if (orderId) {
        await supabase('/order_items', 'POST', {
          order_id: orderId,
          variant_id: item.variantId,
          quantity: item.quantity,
          unit_price: item.price,
          product_name: item.name,
        });
      }

      // Descontar stock de la variante
      const variantRes = await supabase(`/variants?id=eq.${item.variantId}&select=stock`);
      if (variantRes && variantRes.length > 0) {
        const newStock = Math.max(0, (variantRes[0].stock || 0) - item.quantity);
        await supabase(`/variants?id=eq.${item.variantId}`, 'PATCH', { stock: newStock });
      }
    }

    console.log(`✅ Pago ${paymentId} procesado — Orden ${orderId}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, orderId }) };

  } catch (err) {
    console.error('Webhook MP error:', err);
    // Devolver 200 igual para que MP no reintente indefinidamente
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
