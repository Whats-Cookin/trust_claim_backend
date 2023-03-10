import { PrismaClient } from '@prisma/client'
import bcrypt from "bcryptjs";

const prisma = new PrismaClient()
async function main() {

  const alice = await prisma.user.upsert({
    where: { email: 'alice@prisma.io' },
    update: {},
    create: {
      email: 'alice@prisma.io',
      name: 'Alice',
      passwordHash: await bcrypt.hash('password', 12),
      Claim: {
        create: {
          subject: 
          "https://www.bcorporation.net/",
          claim: "rated",
          object: "http://trustclaims.whatscookin.us/local/company/VEJA",
          qualifier:
            "The VEJA project creates a positive chain. Sneakers are made differently using organic, agroecological and fairtrade cotton to make the sneakers canvas, wild rubber from the Amazonian Forest for its soles and innovative materials such as recycled plastic bottles to create a new mesh. VEJA is about minimalism and innovation. Their logistics and shipping run by Ateliers Sans Frontières, a rehabilitation association. Made in Brazil.",
          aspect: "social:impact",
          howKnown: null,
          source: "https://data.world/blab/b-corp-impact-data",
          effectiveDate: null,
          confidence: 0.8,
          reviewRating: 5,
        },
      },
    },
  })

   const josh = await prisma.user.upsert({
    where: { email: 'josh@prisma.io' },
    update: {},
    create: {
      email: 'josh@prisma.io',
      name: 'josh',
      passwordHash: await bcrypt.hash('passwordJosh', 12),
      Claim: {
        create: {
          subject: "https://www.bcorporation.net/",
          claim: "rated",
          object: "http://trustclaims.whatscookin.us/local/company/Maanch",
          qualifier:
            "Maanch is an award winning global impact platform, transforming the way millions of people engage with philanthropy and impact investing worldwide. \\r\\n\\r\\nMaanch aims to influence the flow of funds towards global sustainable development, by providing technology, data and insights on social, environmental, and economic impact.\\r\\n\\r\\nMaanch provides tailor made digital solutions for individuals & families, private banks , wealth advisory firms, grant making trusts and foundations, CSR teams, UK registered charities and international nonprofit organisations .",
          aspect: "social:impact",
          howKnown: null,
          source: "https://data.world/blab/b-corp-impact-data",
          effectiveDate: null,
          confidence: 0.8,
          reviewRating: 5,
        },
      },
    },
  })
   const jean = await prisma.user.upsert({
    where: { email: 'jean@prisma.io' },
    update: {},
    create: {
      email: 'jean@prisma.io',
      name: 'jean',
      passwordHash: await bcrypt.hash('passwordJean', 12),
      Claim: {
        create: {
          subject: "https://www.bcorporation.net/",
          claim: "rated",
          object: "http://trustclaims.whatscookin.us/local/company/Olli%20Ella",
          qualifier:
            "Olli Ella creates timeless pieces that continue to be loved through the generations with emphasis on diversity and social inclusion.  Focused on natural and mindfully sourced materials with true attention on craftsmanship and uplifting the communities where they are made. \\r\\n\\r\\nFounded in 2010 by sisters, Chloe & Olivia Brookman, the company now stretches across the globe with offices in Australia, United Kingdom, USA and Netherlands. Lead with a social and environmental compass, Olli Ella continues to uphold their commitment to use business as a force for good, whilst still evoking a sense of play, fun, quirk and adventure.",
          aspect: "social:impact",
          howKnown: null,
          source: "https://data.world/blab/b-corp-impact-data",
          effectiveDate: null,
          confidence: 0.8,
          reviewRating: 5,
        },
      },
    },
  })
   const sarah = await prisma.user.upsert({
    where: { email: 'sarah@prisma.io' },
    update: {},
    create: {
      email: 'sarah@prisma.io',
      name: 'sarah',
      passwordHash: await bcrypt.hash('passwordSarah', 12),
      Claim: {
        create: {
          subject: "https://www.bcorporation.net/",
          claim: "rated",
          object: "http://trustclaims.whatscookin.us/local/company/Luxelare",
          qualifier:
            "Luxelare is an agro-tech/insurtech company, offering small to medium sized farmers an integrated solution combing precision agriculture and the CAPTUM software platform and digital crop insurance products.",
          aspect: "social:impact",
          howKnown: null,
          source: "https://data.world/blab/b-corp-impact-data",
          effectiveDate: null,
          confidence: 0.8,
          reviewRating: 5,
        },
      },
    },
  })
   const cody = await prisma.user.upsert({
    where: { email: 'cody@prisma.io' },
    update: {},
    create: {
      email: 'cody@prisma.io',
      name: 'cody',
      passwordHash: await bcrypt.hash('passwordCody', 12),
      Claim: {
        create: {
          subject: "https://www.bcorporation.net/",
          claim: "rated",
          object: "http://trustclaims.whatscookin.us/local/company/VEJA",
          qualifier:
            "The VEJA project creates a positive chain. Sneakers are made differently using organic, agroecological and fairtrade cotton to make the sneakers canvas, wild rubber from the Amazonian Forest for its soles and innovative materials such as recycled plastic bottles to create a new mesh. VEJA is about minimalism and innovation. Their logistics and shipping run by Ateliers Sans Frontières, a rehabilitation association. Made in Brazil.",
          aspect: "social:impact",
          howKnown: "first_hand",
          source: "https://data.world/blab/b-corp-impact-data",
          effectiveDate: null,
          confidence: 0.8,
          reviewRating: 5,
        },
      },
    },
  })
   const maximus = await prisma.user.upsert({
    where: { email: 'maximus@prisma.io' },
    update: {},
    create: {
      email: 'maximus@prisma.io',
      name: 'maximus',
      passwordHash: await bcrypt.hash('passwordMaximus', 12),
      Claim: {
        create: {
          subject: "https://www.bcorporation.net/",
          claim: "rated",
          object: "http://trustclaims.whatscookin.us/local/company/Maanch",
          qualifier:
            "Maanch is an award winning global impact platform, transforming the way millions of people engage with philanthropy and impact investing worldwide. \\r\\n\\r\\nMaanch aims to influence the flow of funds towards global sustainable development, by providing technology, data and insights on social, environmental, and economic impact.\\r\\n\\r\\nMaanch provides tailor made digital solutions for individuals & families, private banks , wealth advisory firms, grant making trusts and foundations, CSR teams, UK registered charities and international nonprofit organisations .",
          aspect: "social:impact",
          howKnown: "first_hand",
          source: "https://data.world/blab/b-corp-impact-data",
          effectiveDate: null,
          confidence: 0.8,
          reviewRating: 5,
        },
      },
    },
  })
  const bob = await prisma.user.upsert({
    where: { email: 'bob@prisma.io' },
    update: {},
    create: {
      email: 'bob@prisma.io',
      passwordHash: await bcrypt.hash('1234', 12),
      name: 'Bob',
      Claim: {
        create: [
          {
            subject: "https://www.bcorporation.net/",
            claim: "rated",
            object: "http://trustclaims.whatscookin.us/local/company/Olli%20Ella",
            qualifier:
              "Olli Ella creates timeless pieces that continue to be loved through the generations with emphasis on diversity and social inclusion.  Focused on natural and mindfully sourced materials with true attention on craftsmanship and uplifting the communities where they are made. \\r\\n\\r\\nFounded in 2010 by sisters, Chloe & Olivia Brookman, the company now stretches across the globe with offices in Australia, United Kingdom, USA and Netherlands. Lead with a social and environmental compass, Olli Ella continues to uphold their commitment to use business as a force for good, whilst still evoking a sense of play, fun, quirk and adventure.",
            aspect: "social:impact",
            howKnown: "first_hand",
            source: "https://data.world/blab/b-corp-impact-data",
            effectiveDate: null,
            confidence: 0.8,
            reviewRating: 5,
          },
          {
            subject: "https://www.bcorporation.net/",
            claim: "rated",
            object: "http://trustclaims.whatscookin.us/local/company/Luxelare",
            qualifier:
              "Luxelare is an agro-tech/insurtech company, offering small to medium sized farmers an integrated solution combing precision agriculture and the CAPTUM software platform and digital crop insurance products.",
            aspect: "social:impact",
            howKnown: "first_hand",
            source: "https://data.world/blab/b-corp-impact-data",
            effectiveDate: null,
            confidence: 0.8,
            reviewRating: 5,
          },
        ],
      },
    },
  })
   const clark = await prisma.user.upsert({
    where: { email: 'clark@prisma.io' },
    update: {},
    create: {
      email: 'clark@prisma.io',
      name: 'clark',
      passwordHash: await bcrypt.hash('passwordClark', 12),
      Claim: {
        create: {
          subject: "https://www.bcorporation.net/",
          claim: "rated",
          object: "http://trustclaims.whatscookin.us/local/company/Luxelare",
          qualifier:
            "Luxelare is an agro-tech/insurtech company, offering small to medium sized farmers an integrated solution combing precision agriculture and the CAPTUM software platform and digital crop insurance products.",
          aspect: "social:impact",
          howKnown: "first_hand",
          source: "https://data.world/blab/b-corp-impact-data",
          effectiveDate: null,
          confidence: 0.8,
          reviewRating: 5,
        },
      },
    },
  })
  console.log({ alice, josh, jean, sarah, cody, maximus, bob, clark })
}
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })