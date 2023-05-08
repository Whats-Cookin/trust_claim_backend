import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // Create some nodes
  const node1 = await prisma.node.create({
    data: {
      nodeUri: 'https://example.com/node1',
      name: 'Node 1',
      entType: 'PERSON',
      descrip: 'Description of Node 1',
      image: 'https://example.com/node1/image',
      thumbnail: 'https://example.com/node1/thumbnail',
    },
  });

  const node2 = await prisma.node.create({
    data: {
      nodeUri: 'https://example.com/node2',
      name: 'Node 2',
      entType: 'ORGANIZATION',
      descrip: 'Description of Node 2',
      image: 'https://example.com/node2/image',
      thumbnail: 'https://example.com/node2/thumbnail',
    },
  });

  // Create some claims
  const claim1 = await prisma.claim.create({
    data: {
      subject: 'https://example.com/subject1',
      claim: 'https://example.com/claim1',
      object: 'https://example.com/object1',
      statement: 'Statement for Claim 1',
    },
  });

  const claim2 = await prisma.claim.create({
    data: {
      subject: 'https://example.com/subject2',
      claim: 'https://example.com/claim2',
      object: 'https://example.com/object2',
      statement: 'Statement for Claim 2',
    },
  });

  // Create some edges
  const edge1 = await prisma.edge.create({
    data: {
      startNode: { connect: { id: node1.id } },
      endNode: { connect: { id: node2.id } },
      label: 'Claim',
      claim: { connect: { id: claim1.id } },
    },
  });

  const edge2 = await prisma.edge.create({
    data: {
      startNode: { connect: { id: node2.id } },
      endNode: { connect: { id: node1.id } },
      label: 'Claim',
      claim: { connect: { id: claim2.id } },
    },
  });

  console.log({edge1, edge2 });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
