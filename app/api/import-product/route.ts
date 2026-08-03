type JsonValue=Record<string,unknown>|unknown[]|string|number|boolean|null;

function blocked(hostname:string){const host=hostname.toLowerCase().replace(/^\[|\]$/g,"");return host==="localhost"||host.endsWith(".local")||host==="0.0.0.0"||host==="::1"||host.startsWith("127.")||host.startsWith("10.")||host.startsWith("192.168.")||/^172\.(1[6-9]|2\d|3[01])\./.test(host)||host.startsWith("169.254.")}
function findProduct(value:JsonValue):Record<string,unknown>|null{if(Array.isArray(value)){for(const item of value){if(item&&typeof item==="object"){const found=findProduct(item as JsonValue);if(found)return found}}return null}if(!value||typeof value!=="object")return null;const object=value as Record<string,unknown>;const type=object["@type"];if(type==="Product"||(Array.isArray(type)&&type.includes("Product")))return object;for(const child of Object.values(object)){if(child&&typeof child==="object"){const found=findProduct(child as JsonValue);if(found)return found}}return null}
function clean(value:unknown){return typeof value==="string"?value.replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g," ").trim():""}
function meta(html:string,key:string){const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const a=html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,`i`));const b=html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,`i`));return clean(a?.[1]??b?.[1])}
function packageSize(value:string){const matches=[...value.matchAll(/(\d+(?:\.\d+)?)\s*(fluid ounces?|fl\.?\s*oz\.?|ounces?|oz\.?|pounds?|lbs?\.?|teaspoons?|tsp\.?|tablespoons?|tbsp?\.?|cups?|pints?|pt\.?|quarts?|qt\.?|gallons?|gal\.?|dozens?)(?:\b|$)/gi)];const match=matches.at(-1);if(!match)return null;const raw=match[2].toLowerCase();let unit="each";if(/^fl|fluid/.test(raw))unit="fl oz";else if(/^oz|ounce/.test(raw))unit="oz";else if(/^lb|pound/.test(raw))unit="lb";else if(/^tsp|teaspoon/.test(raw))unit="tsp";else if(/^tbsp|tablespoon/.test(raw))unit="tbsp";else if(/^cup/.test(raw))unit="cup";else if(/^pt|pint/.test(raw))unit="pt";else if(/^qt|quart/.test(raw))unit="qt";else if(/^gal/.test(raw))unit="gal";else if(/^dozen/.test(raw))unit="dozen";return{packageQty:Number(match[1]),packageUnit:unit}}

export async function POST(request:Request){
  try{
    const body=await request.json() as {url?:string};let target=new URL(String(body.url??""));
    if(!["http:","https:"].includes(target.protocol)||blocked(target.hostname))return Response.json({error:"Enter a public product link."},{status:400});
    let response:Response|null=null;for(let i=0;i<4;i++){response=await fetch(target.toString(),{redirect:"manual",headers:{"User-Agent":"Foodotron Product Scanner/1.0","Accept":"text/html,application/xhtml+xml"}});if(response.status>=300&&response.status<400){const location=response.headers.get("location");if(!location)break;target=new URL(location,target);if(!["http:","https:"].includes(target.protocol)||blocked(target.hostname))return Response.json({error:"The product link redirected to an unsupported address."},{status:400});continue}break}
    if(!response?.ok)return Response.json({error:"That store blocked the scan. You can still enter the details manually."},{status:422});
    const html=(await response.text()).slice(0,2_500_000);let product:Record<string,unknown>|null=null;
    for(const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{product=findProduct(JSON.parse(match[1]) as JsonValue);if(product)break}catch{}}
    const name=clean(product?.name)||meta(html,"og:title")||clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])||"Product";
    const offers=Array.isArray(product?.offers)?product?.offers[0]:product?.offers;const offer=offers&&typeof offers==="object"?offers as Record<string,unknown>:{};
    const price=Number(offer.price??offer.lowPrice??meta(html,"product:price:amount")??meta(html,"og:price:amount")??0);
    const sizeText=[clean(product?.size),clean(product?.description),name].filter(Boolean).join(" ");const size=packageSize(sizeText);
    const parts=target.hostname.replace(/^www\./,"").split(".");const store=(parts.length>1?parts[parts.length-2]:parts[0]).replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
    if(!price&&!size)return Response.json({error:"Foodotron found the page, but it did not expose a price or package size. Enter them manually."},{status:422});
    return Response.json({name,store,price:Number.isFinite(price)?price:0,...size,url:target.toString()});
  }catch{return Response.json({error:"Foodotron could not read that product link."},{status:400})}
}
