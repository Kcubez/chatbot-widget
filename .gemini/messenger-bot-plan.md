# Messenger E-Commerce Bot — Implementation Plan

## Build Order

1. Database Schema (Product, Order, DeliveryZone, MessengerSession)
2. Messenger Webhook (connect + send/receive)
3. Product Management Dashboard + CSV Import
4. Delivery Zones (fixed list + dashboard management)
5. AI Tool Calling (product search, stock check, order create)
6. Order Management Dashboard
7. Google Sheets Sync
8. Invoice Generation

## Database Models

### Product

- id, botId, name, price, category, stockCount, image, description, isActive, createdAt, updatedAt

### DeliveryZone

- id, botId, township, city, fee, isActive

### Order

- id, botId, messengerSenderId, customerName, customerPhone, customerAddress, customerTownship
- items (Json - array of {productId, name, price, qty})
- subtotal, deliveryFee, total
- status (pending, confirmed, shipped, delivered, cancelled)
- sheetSynced (bool), invoiceSent (bool)
- createdAt, updatedAt

### MessengerSession (tracks conversation state per user)

- id, botId, messengerSenderId
- state (browsing, ordering, confirming, collecting_info)
- cart (Json), pendingData (Json)
- updatedAt
