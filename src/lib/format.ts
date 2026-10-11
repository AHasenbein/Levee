export const usd = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US")
export const usd2 = (n: number) => "$" + n.toFixed(2)
export const pct = (x: number, d = 1) => (x * 100).toFixed(d) + "%"
