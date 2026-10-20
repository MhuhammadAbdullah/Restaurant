const {PrismaClient}=require("@restaurant/database");
(async()=>{const p=new PrismaClient();const r=await p.restaurant.findFirst();const s=r.settings||{};const cur=s.bankDiscounts?.enabled===true;
const want=process.argv[2]==="restore"?process.argv[3]==="true":true;
if(process.argv[2]!=="restore")console.log("was",cur);
await p.restaurant.update({where:{id:r.id},data:{settings:{...s,bankDiscounts:{...(s.bankDiscounts||{}),enabled:want}}}});
console.log("now",want);await p.$disconnect()})();
