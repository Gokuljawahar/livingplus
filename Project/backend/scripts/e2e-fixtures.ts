// Extra end-to-end fixtures on top of the demo seed: a PG owner account with
// owner access to every seeded property.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

export const E2E_OWNER = { phone: '9555500001', password: 'Owner@e2e-pass1', name: 'E2E Owner' };

const prisma = new PrismaClient();
const owner = await prisma.user.upsert({
  where: { phone: E2E_OWNER.phone },
  update: {},
  create: { phone: E2E_OWNER.phone, name: E2E_OWNER.name, role: 'PG_OWNER', password: await bcrypt.hash(E2E_OWNER.password, 10) }
});
const properties = await prisma.pGProperty.findMany({ select: { id: true } });
for (const property of properties) {
  await prisma.pGPropertyAccess.upsert({
    where: { propertyId_userId: { propertyId: property.id, userId: owner.id } },
    update: { role: 'OWNER' },
    create: { propertyId: property.id, userId: owner.id, role: 'OWNER' }
  });
}
console.log(`[e2e] owner ${E2E_OWNER.phone} can manage ${properties.length} properties`);
await prisma.$disconnect();
