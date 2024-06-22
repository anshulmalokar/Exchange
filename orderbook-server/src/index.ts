import express from "express";
import { OrderInputSchema } from "./types";
import { bookWithQuantity, orderBook } from "./orderbook";

const app = express();

const BASE_ASSET = "BTC";
const QUOTE_ASSET = "USD";
let GLOBAL_TRADE_ID = 0;

app.post("/api/v1/order", (req, res) => {
  const order = OrderInputSchema.safeParse(req.body);
  if (!order) {
    //   @ts-ignore
    return res.status(400).send(order.error.message);
  }
  //   @ts-ignore
  const { baseAsset, quoteAsset, price, quantity, side, kind } = order.data;

  const orderId: string = getOrderId();
  if (baseAsset !== BASE_ASSET || quoteAsset !== QUOTE_ASSET) {
    res.status(400).send("Invalid base or quote asset");
    return;
  }

  fillOrder(orderId, price, quantity, side, kind);
});

interface Fill {
  price: number;
  qty: number;
  tradeid: number;
}

function fillOrder(
  orderId: string,
  price: number,
  quantity: number,
  side: any,
  type?: "ioc"
): { status: "rejected" | "accepted"; executedQty: number; fills: Fill[] } {
  const fills: Fill[] = [];
  const maxFillQuantity: number = getMaxFillQuantity(price, quantity, side);
  let executedQty = 0;
  if (type === "ioc" && maxFillQuantity < quantity) {
    return {
      status: "rejected",
      executedQty: maxFillQuantity,
      fills: [],
    };
  }

  if (side === "buy") {
    orderBook.asks.forEach((e) => {
      if (price >= e.price && quantity != 0) {
        console.log("filling ask");
        const filled = Math.min(quantity, e.quantity);
        console.log(filled);
        e.quantity -= filled;
        bookWithQuantity.asks[price] -= filled;

        fills.push({
          price: price,
          qty: filled,
          tradeid: GLOBAL_TRADE_ID++,
        });

        executedQty += filled;
        // Most probably this is the bug
        quantity -= filled;

        if (e.quantity === 0) {
          orderBook.asks.splice(orderBook.asks.indexOf(e), 1);
        }

        if (bookWithQuantity.asks[price] === 0) {
          delete bookWithQuantity.asks[price];
        }
      }

      if(quantity !== 0){
        orderBook.bids.push({
            orderId: orderId,
            price: price,
            quantity: quantity - executedQty,
            side: 'bid'
        });
        bookWithQuantity.bids[price] = (quantity - executedQty) + (bookWithQuantity.bids[price] || 0)
      }
      
    });
  } else if (side === "sell") {
     orderBook.bids.forEach(e => {
        if(e.price > price && quantity > 0){
            const filled = Math.min(quantity,e.quantity);
            e.quantity -= filled;
            bookWithQuantity.bids[price] -= filled;
            fills.push({
                price,
                qty: filled,
                tradeid: GLOBAL_TRADE_ID++
            })
            
            executedQty += filled;
            quantity -= filled;

            if(e.quantity == 0){
                // Delete the record from orderBook
                orderBook.bids.splice(orderBook.bids.indexOf(e),1);
            }

            if(bookWithQuantity.bids[price] === 0){
                delete bookWithQuantity.bids[price];
            }
        }
        // Add things in the asks array
        if(quantity != 0){
            orderBook.asks.push({
                price,
                side: "ask",
                orderId: orderId,
                quantity: quantity
            })
        }
        bookWithQuantity.asks[price] =  quantity + (bookWithQuantity.asks[price] || 0)
     })
  }

  return {
    status: "rejected",
    executedQty,
    fills,
  };
}

// Generating the maximum quantity that can be filled
function getMaxFillQuantity(
  price: number,
  quantity: number,
  side: "buy" | "sell"
) {
  let filled = 0;
  if (side === "buy") {
    orderBook.asks.forEach((e) => {
      if (e.price < price) {
        filled += Math.min(quantity, e.quantity);
      }
    });
  } else {
    orderBook.bids.forEach((e) => {
      if (e.price > price) {
        filled = Math.min(quantity, e.quantity);
      }
    });
  }
  return filled;
}

function getOrderId() {
  return (
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36)
  );
}

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
