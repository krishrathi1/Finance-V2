import { describe, expect, it } from "vitest";
import {
  parseBrokerCsv,
  cleanStockSymbol,
  normalizeDate,
  parseCleanNumber,
} from "./broker-importer";

describe("Broker Importer Engine", () => {
  it("cleans and normalizes stock symbols properly", () => {
    expect(cleanStockSymbol("TATAMOTORS-EQ")).toBe("TATAMOTORS");
    expect(cleanStockSymbol("RELIANCE.NS")).toBe("RELIANCE");
    expect(cleanStockSymbol("INFY.BO")).toBe("INFY");
    expect(cleanStockSymbol("\uFEFFHDFCBANK-EQ")).toBe("HDFCBANK");
    expect(cleanStockSymbol("M&M-BE")).toBe("M&M");
  });

  it("normalizes various date formats into YYYY-MM-DD", () => {
    expect(normalizeDate("2024-03-15")).toBe("2024-03-15");
    expect(normalizeDate("15-03-2024")).toBe("2024-03-15");
    expect(normalizeDate("15/03/2024")).toBe("2024-03-15");
    expect(normalizeDate("2024/03/15 11:30:00")).toBe("2024-03-15");
  });

  it("parses currency and formatted numbers", () => {
    expect(parseCleanNumber("₹ 1,500.50")).toBe(1500.5);
    expect(parseCleanNumber("10,000")).toBe(10000);
    expect(parseCleanNumber("Rs. 250.00")).toBe(250);
    expect(parseCleanNumber("")).toBe(0);
    expect(parseCleanNumber(undefined)).toBe(0);
  });

  it("parses Zerodha Tradebook format", () => {
    const csv = `symbol,isin,trade_date,exchange,segment,series,trade_type,quantity,price,order_id,trade_id,order_execution_time
TATAMOTORS,INE155A01022,2024-01-10,NSE,EQ,EQ,buy,50,780.50,123456,789012,2024-01-10 10:15:00
INFY,INE009A01021,2024-01-12,NSE,EQ,EQ,buy,25,1520.00,123457,789013,2024-01-12 11:20:00
RELIANCE,INE002A01018,2024-01-15,NSE,EQ,EQ,sell,10,2800.00,123458,789014,2024-01-15 14:00:00`;

    const result = parseBrokerCsv(csv);
    expect(result.brokerName).toBe("Zerodha");
    expect(result.totalValid).toBe(2); // sell is ignored
    expect(result.trades[0].symbol).toBe("TATAMOTORS");
    expect(result.trades[0].quantity).toBe(50);
    expect(result.trades[0].buyPrice).toBe(780.5);
  });

  it("parses Groww format with BOM and currency formatting", () => {
    const csv = `\uFEFFStock name,ISIN,Quantity,Buy price,Buy date
"Tata Consultancy Services",INE467B01029,"10","₹ 3,850.00","18/02/2024"
"ITC Ltd",INE154A01025,"100","420.50","20/02/2024"`;

    const result = parseBrokerCsv(csv);
    expect(result.totalValid).toBe(2);
    expect(result.trades[0].quantity).toBe(10);
    expect(result.trades[0].buyPrice).toBe(3850);
    expect(result.trades[0].buyDate).toBe("2024-02-18");
  });

  it("gracefully handles empty or malformed CSV", () => {
    const emptyResult = parseBrokerCsv("");
    expect(emptyResult.totalValid).toBe(0);
    expect(emptyResult.trades).toHaveLength(0);

    const invalidResult = parseBrokerCsv("Symbol,Qty,Price,Date\n,,,");
    expect(invalidResult.totalErrors).toBe(1);
    expect(invalidResult.totalValid).toBe(0);
  });
});
