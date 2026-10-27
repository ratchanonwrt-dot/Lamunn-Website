-- AlterTable
ALTER TABLE "live_shifts" ADD COLUMN     "orderCount" INTEGER,
ADD COLUMN     "shippingCost" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "live_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costPerSet" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_order_lines" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_order_lines_shiftId_idx" ON "shift_order_lines"("shiftId");

-- AddForeignKey
ALTER TABLE "shift_order_lines" ADD CONSTRAINT "shift_order_lines_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "live_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_order_lines" ADD CONSTRAINT "shift_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "live_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

