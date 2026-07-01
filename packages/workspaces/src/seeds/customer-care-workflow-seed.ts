/**
 * Customer Care Bot Workflow Seed
 *
 * A comprehensive customer care bot flow that follows the "Bot-First, Handoff to Human" pattern.
 * The bot triages customer inquiries, collects relevant information, and hands off to
 * a human agent when needed.
 *
 * Flow:
 * ┌──────────┐    ┌───────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────┐
 * │ Greeting │───▶│ Main Menu │───▶│ Branch Handling   │───▶│ Collect Info     │───▶│ Handoff  │
 * │          │    │ (5 options)│    │ (Product/Tech/    │    │ (Name/Phone/     │    │ to Agent │
 * │          │    │           │    │  Quote/Complaint) │    │  Email)          │    │          │
 * └──────────┘    └───────────┘    └──────────────────┘    └──────────────────┘    └──────────┘
 *                      │                                                                ▲
 *                      │ "Nói chuyện với tư vấn viên" ──────────────────────────────────┘
 *
 * Handoff Signal: Uses Set Variable block with variable name "handoff_to_agent" = "true"
 * which is detected by the CRM-Bot TypebotAdapter.containsHandoffSignal()
 *
 * Usage:
 *   import { createCustomerCareWorkflow } from './seeds/customer-care-workflow-seed';
 *   await createCustomerCareWorkflow(prisma, workspaceId);
 *
 * @module workspaces/seeds
 */

import { randomUUID } from 'crypto';

type PrismaLike = {
  typebot: { create: (args: any) => Promise<{ id: string }> };
  publicTypebot: { create: (args: any) => Promise<any> };
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const textBubble = (groupId: string, text: string) => ({
  id: randomUUID(),
  type: 'text' as const,
  groupId,
  content: {
    richText: [
      {
        type: 'p',
        children: [{ text }],
      },
    ],
  },
});

const choiceInput = (
  groupId: string,
  items: Array<{ content: string; outgoingEdgeId?: string }>,
) => ({
  id: randomUUID(),
  type: 'choice input' as const,
  groupId,
  items: items.map((item) => ({
    id: randomUUID(),
    content: item.content,
    outgoingEdgeId: item.outgoingEdgeId,
  })),
});

const textInput = (
  groupId: string,
  variableId: string,
  placeholder: string,
) => ({
  id: randomUUID(),
  type: 'text input' as const,
  groupId,
  options: {
    labels: { placeholder },
    variableId,
  },
});

const setVariable = (groupId: string, variableId: string, value: string) => ({
  id: randomUUID(),
  type: 'Set variable' as const,
  groupId,
  options: {
    variableId,
    expressionToEvaluate: value,
    type: 'Custom',
  },
});

const makeEdge = (
  from: { groupId?: string; blockId?: string; eventId?: string },
  to: { groupId: string },
) => ({
  id: randomUUID(),
  from,
  to,
});

// ──────────────────────────────────────────────────────────────────────────────
// Main Seed Function
// ──────────────────────────────────────────────────────────────────────────────

export const createCustomerCareWorkflow = async (
  tx: PrismaLike,
  workspaceId: string,
) => {
  // ── Variables ────────────────────────────────────────────────────────────
  const varCustomerName = { id: randomUUID(), name: 'customer_name' };
  const varCustomerPhone = { id: randomUUID(), name: 'customer_phone' };
  const varCustomerEmail = { id: randomUUID(), name: 'customer_email' };
  const varProductType = { id: randomUUID(), name: 'product_type' };
  const varIssueDescription = { id: randomUUID(), name: 'issue_description' };
  const varOrderId = { id: randomUUID(), name: 'order_id' };
  const varServiceType = { id: randomUUID(), name: 'service_type' };
  const varQuantity = { id: randomUUID(), name: 'quantity' };
  const varHandoff = { id: randomUUID(), name: 'handoff_to_agent' };

  const variables = [
    varCustomerName,
    varCustomerPhone,
    varCustomerEmail,
    varProductType,
    varIssueDescription,
    varOrderId,
    varServiceType,
    varQuantity,
    varHandoff,
  ];

  // ── Group IDs ───────────────────────────────────────────────────────────
  const grpGreeting = randomUUID();
  const grpProductInquiry = randomUUID();
  const grpProductFollowUp = randomUUID();
  const grpTechSupport = randomUUID();
  const grpTechFaqAnswer = randomUUID();
  const grpTechFollowUp = randomUUID();
  const grpQuoteRequest = randomUUID();
  const grpQuoteDetails = randomUUID();
  const grpComplaint = randomUUID();
  const grpCollectInfo = randomUUID();
  const grpHandoffQualified = randomUUID();
  const grpDirectHandoff = randomUUID();
  const grpGoodbye = randomUUID();

  // ── Start Event ─────────────────────────────────────────────────────────
  const startEventId = randomUUID();
  const startEdgeId = randomUUID();

  const events = [
    {
      id: startEventId,
      type: 'start' as const,
      graphCoordinates: { x: 0, y: 300 },
      outgoingEdgeId: startEdgeId,
    },
  ];

  // ── Edges (defined here, linked below) ──────────────────────────────────
  // Main menu → branch edges
  const edgeToProduct = randomUUID();
  const edgeToTech = randomUUID();
  const edgeToQuote = randomUUID();
  const edgeToComplaint = randomUUID();
  const edgeToDirectHandoff = randomUUID();

  // Branch → collect info / follow-up edges
  const edgeProductToFollowUp = randomUUID();
  const edgeProductFollowUpToMenu = randomUUID();
  const edgeProductFollowUpToCollect = randomUUID();
  const edgeTechToFaq = randomUUID();
  const edgeTechFaqToFollowUp = randomUUID();
  const edgeTechFollowUpToGoodbye = randomUUID();
  const edgeTechFollowUpToCollect = randomUUID();
  const edgeQuoteToDetails = randomUUID();
  const edgeQuoteDetailsToHandoff = randomUUID();
  const edgeComplaintToCollect = randomUUID();
  const edgeCollectToHandoff = randomUUID();
  const edgeDirectToHandoff = randomUUID();

  // ── Groups ──────────────────────────────────────────────────────────────

  // 1. Greeting + Main Menu
  const greetingBlocks = [
    textBubble(
      grpGreeting,
      '👋 Xin chào! Tôi là trợ lý ảo của chúng tôi.\nRất vui được hỗ trợ bạn hôm nay!',
    ),
    textBubble(
      grpGreeting,
      'Bạn cần hỗ trợ về vấn đề gì?',
    ),
    {
      ...choiceInput(grpGreeting, [
        { content: '💬 Tư vấn sản phẩm', outgoingEdgeId: edgeToProduct },
        { content: '🔧 Hỗ trợ kỹ thuật', outgoingEdgeId: edgeToTech },
        { content: '💰 Yêu cầu báo giá', outgoingEdgeId: edgeToQuote },
        { content: '📝 Khiếu nại / Phản hồi', outgoingEdgeId: edgeToComplaint },
        {
          content: '👤 Nói chuyện với tư vấn viên',
          outgoingEdgeId: edgeToDirectHandoff,
        },
      ]),
    },
  ];

  // 2. Product Inquiry
  const productInquiryBlocks = [
    textBubble(grpProductInquiry, '📦 Bạn quan tâm đến sản phẩm/dịch vụ nào?'),
    textInput(grpProductInquiry, varProductType.id, 'Nhập tên sản phẩm...'),
    textBubble(
      grpProductInquiry,
      'Cảm ơn bạn! Chúng tôi có nhiều giải pháp phù hợp cho nhu cầu của bạn.\n\n📌 Để được tư vấn chi tiết nhất, bạn có thể chọn:',
    ),
  ];
  // Add outgoing edge to the last block
  const productLastBlock = {
    ...choiceInput(grpProductFollowUp, [
      {
        content: '🔄 Tìm hiểu thêm sản phẩm khác',
        outgoingEdgeId: edgeProductFollowUpToMenu,
      },
      {
        content: '🛒 Đặt hàng / Tư vấn chi tiết',
        outgoingEdgeId: edgeProductFollowUpToCollect,
      },
    ]),
  };

  // 3. Product Follow-Up
  const productFollowUpBlocks = [productLastBlock];

  // 4. Technical Support
  const techSupportBlocks = [
    textBubble(
      grpTechSupport,
      '🔧 Vui lòng mô tả vấn đề bạn đang gặp phải:',
    ),
    textInput(
      grpTechSupport,
      varIssueDescription.id,
      'Mô tả vấn đề của bạn...',
    ),
    textBubble(
      grpTechSupport,
      'Cảm ơn bạn đã cung cấp thông tin!\n\n🔍 Dưới đây là một số hướng dẫn phổ biến:',
    ),
  ];

  // 5. Tech FAQ Answer
  const techFaqBlocks = [
    textBubble(
      grpTechFaqAnswer,
      '📋 **Hướng dẫn xử lý nhanh:**\n\n1️⃣ Khởi động lại thiết bị/ứng dụng\n2️⃣ Kiểm tra kết nối Internet\n3️⃣ Xóa cache và thử lại\n4️⃣ Cập nhật phiên bản mới nhất',
    ),
    textBubble(grpTechFaqAnswer, 'Vấn đề của bạn đã được giải quyết chưa?'),
  ];

  // 6. Tech Follow-Up
  const techFollowUpBlocks = [
    {
      ...choiceInput(grpTechFollowUp, [
        {
          content: '✅ Đã giải quyết, cảm ơn!',
          outgoingEdgeId: edgeTechFollowUpToGoodbye,
        },
        {
          content: '❌ Chưa giải quyết, cần hỗ trợ thêm',
          outgoingEdgeId: edgeTechFollowUpToCollect,
        },
      ]),
    },
  ];

  // 7. Quote Request
  const quoteRequestBlocks = [
    textBubble(
      grpQuoteRequest,
      '💰 Để gửi báo giá chính xác, tôi cần một vài thông tin:',
    ),
    textBubble(grpQuoteRequest, 'Bạn cần dịch vụ/sản phẩm gì?'),
    textInput(grpQuoteRequest, varServiceType.id, 'Loại dịch vụ/sản phẩm...'),
    textBubble(grpQuoteRequest, 'Số lượng hoặc quy mô dự kiến?'),
    textInput(grpQuoteRequest, varQuantity.id, 'Nhập số lượng...'),
  ];

  // 8. Quote Details
  const quoteDetailsBlocks = [
    textBubble(
      grpQuoteDetails,
      '📧 Vui lòng cung cấp email để chúng tôi gửi báo giá:',
    ),
    textInput(grpQuoteDetails, varCustomerEmail.id, 'email@example.com'),
    textBubble(grpQuoteDetails, 'Số điện thoại liên hệ:'),
    textInput(grpQuoteDetails, varCustomerPhone.id, '0901234567'),
    textBubble(
      grpQuoteDetails,
      '✅ Đã ghi nhận yêu cầu báo giá của bạn!\nĐang chuyển bạn đến bộ phận kinh doanh...',
    ),
  ];

  // 9. Complaint
  const complaintBlocks = [
    textBubble(
      grpComplaint,
      '📝 Chúng tôi rất tiếc vì sự bất tiện! Vui lòng cho biết:',
    ),
    textBubble(grpComplaint, 'Vấn đề bạn gặp phải là gì?'),
    textInput(grpComplaint, varIssueDescription.id, 'Mô tả vấn đề...'),
    textBubble(grpComplaint, 'Mã đơn hàng (nếu có):'),
    textInput(grpComplaint, varOrderId.id, 'VD: DH-12345'),
  ];

  // 10. Collect Info (shared by Product / Tech / Complaint branches)
  const collectInfoBlocks = [
    textBubble(
      grpCollectInfo,
      '📋 Để hỗ trợ tốt nhất, vui lòng cung cấp thông tin liên hệ:',
    ),
    textBubble(grpCollectInfo, 'Họ và tên của bạn:'),
    textInput(grpCollectInfo, varCustomerName.id, 'Nguyễn Văn A'),
    textBubble(grpCollectInfo, 'Số điện thoại:'),
    textInput(grpCollectInfo, varCustomerPhone.id, '0901234567'),
    textBubble(grpCollectInfo, 'Email:'),
    textInput(grpCollectInfo, varCustomerEmail.id, 'email@example.com'),
  ];

  // 11. Handoff Qualified (with context summary)
  const handoffQualifiedBlocks = [
    textBubble(
      grpHandoffQualified,
      '🔄 Cảm ơn bạn đã cung cấp thông tin!\nĐang kết nối bạn với tư vấn viên...',
    ),
    textBubble(
      grpHandoffQualified,
      '⏳ Vui lòng chờ trong giây lát, tư vấn viên sẽ tiếp nhận ngay.',
    ),
    setVariable(grpHandoffQualified, varHandoff.id, 'true'),
  ];

  // 12. Direct Handoff (user chose "Talk to agent" immediately)
  const directHandoffBlocks = [
    textBubble(
      grpDirectHandoff,
      '👤 Tôi sẽ chuyển bạn đến tư vấn viên ngay!\n⏳ Vui lòng chờ trong giây lát...',
    ),
    setVariable(grpDirectHandoff, varHandoff.id, 'true'),
  ];

  // 13. Goodbye (self-resolved)
  const goodbyeBlocks = [
    textBubble(
      grpGoodbye,
      '🎉 Tuyệt vời! Rất vui vì đã giúp được bạn!\n\nNếu cần hỗ trợ thêm, đừng ngần ngại liên hệ lại nhé. Chúc bạn một ngày tốt lành! 👋',
    ),
  ];

  // ── Assemble Groups ─────────────────────────────────────────────────────
  const groups = [
    {
      id: grpGreeting,
      title: 'Greeting',
      graphCoordinates: { x: 400, y: 200 },
      blocks: greetingBlocks,
    },
    {
      id: grpProductInquiry,
      title: 'Product Inquiry',
      graphCoordinates: { x: 900, y: 0 },
      blocks: productInquiryBlocks,
    },
    {
      id: grpProductFollowUp,
      title: 'Product Follow-Up',
      graphCoordinates: { x: 1350, y: 0 },
      blocks: productFollowUpBlocks,
    },
    {
      id: grpTechSupport,
      title: 'Technical Support',
      graphCoordinates: { x: 900, y: 300 },
      blocks: techSupportBlocks,
    },
    {
      id: grpTechFaqAnswer,
      title: 'FAQ Answer',
      graphCoordinates: { x: 1350, y: 300 },
      blocks: techFaqBlocks,
    },
    {
      id: grpTechFollowUp,
      title: 'Tech Follow-Up',
      graphCoordinates: { x: 1800, y: 300 },
      blocks: techFollowUpBlocks,
    },
    {
      id: grpQuoteRequest,
      title: 'Quote Request',
      graphCoordinates: { x: 900, y: 600 },
      blocks: quoteRequestBlocks,
    },
    {
      id: grpQuoteDetails,
      title: 'Quote Details',
      graphCoordinates: { x: 1350, y: 600 },
      blocks: quoteDetailsBlocks,
    },
    {
      id: grpComplaint,
      title: 'Complaint',
      graphCoordinates: { x: 900, y: 900 },
      blocks: complaintBlocks,
    },
    {
      id: grpCollectInfo,
      title: 'Collect Contact Info',
      graphCoordinates: { x: 1800, y: 0 },
      blocks: collectInfoBlocks,
    },
    {
      id: grpHandoffQualified,
      title: 'Handoff to Agent',
      graphCoordinates: { x: 2250, y: 200 },
      blocks: handoffQualifiedBlocks,
    },
    {
      id: grpDirectHandoff,
      title: 'Direct Handoff',
      graphCoordinates: { x: 900, y: 1200 },
      blocks: directHandoffBlocks,
    },
    {
      id: grpGoodbye,
      title: 'Goodbye',
      graphCoordinates: { x: 2250, y: 500 },
      blocks: goodbyeBlocks,
    },
  ];

  // ── Edges ───────────────────────────────────────────────────────────────
  const edges = [
    // Start → Greeting
    { id: startEdgeId, from: { eventId: startEventId }, to: { groupId: grpGreeting } },

    // Main menu choices → branches
    { id: edgeToProduct, from: { groupId: grpGreeting }, to: { groupId: grpProductInquiry } },
    { id: edgeToTech, from: { groupId: grpGreeting }, to: { groupId: grpTechSupport } },
    { id: edgeToQuote, from: { groupId: grpGreeting }, to: { groupId: grpQuoteRequest } },
    { id: edgeToComplaint, from: { groupId: grpGreeting }, to: { groupId: grpComplaint } },
    { id: edgeToDirectHandoff, from: { groupId: grpGreeting }, to: { groupId: grpDirectHandoff } },

    // Product → Follow-Up
    { id: edgeProductToFollowUp, from: { groupId: grpProductInquiry }, to: { groupId: grpProductFollowUp } },
    // Product Follow-Up → back to menu OR collect info
    { id: edgeProductFollowUpToMenu, from: { groupId: grpProductFollowUp }, to: { groupId: grpGreeting } },
    { id: edgeProductFollowUpToCollect, from: { groupId: grpProductFollowUp }, to: { groupId: grpCollectInfo } },

    // Tech → FAQ → Follow-Up
    { id: edgeTechToFaq, from: { groupId: grpTechSupport }, to: { groupId: grpTechFaqAnswer } },
    { id: edgeTechFaqToFollowUp, from: { groupId: grpTechFaqAnswer }, to: { groupId: grpTechFollowUp } },
    // Tech Follow-Up → Goodbye or Collect Info
    { id: edgeTechFollowUpToGoodbye, from: { groupId: grpTechFollowUp }, to: { groupId: grpGoodbye } },
    { id: edgeTechFollowUpToCollect, from: { groupId: grpTechFollowUp }, to: { groupId: grpCollectInfo } },

    // Quote → Details → Handoff
    { id: edgeQuoteToDetails, from: { groupId: grpQuoteRequest }, to: { groupId: grpQuoteDetails } },
    { id: edgeQuoteDetailsToHandoff, from: { groupId: grpQuoteDetails }, to: { groupId: grpHandoffQualified } },

    // Complaint → Collect Info
    { id: edgeComplaintToCollect, from: { groupId: grpComplaint }, to: { groupId: grpCollectInfo } },

    // Collect Info → Handoff
    { id: edgeCollectToHandoff, from: { groupId: grpCollectInfo }, to: { groupId: grpHandoffQualified } },

    // Direct Handoff → Handoff Qualified
    { id: edgeDirectToHandoff, from: { groupId: grpDirectHandoff }, to: { groupId: grpHandoffQualified } },
  ];

  // ── Create Typebot ──────────────────────────────────────────────────────
  const publicId = `customer-care-${workspaceId.substring(0, 8)}`;

  const typebot = await tx.typebot.create({
    data: {
      version: '6.1',
      name: 'Customer Care Bot',
      icon: '🏥',
      workspaceId,
      publicId,
      groups,
      events,
      variables,
      edges,
      theme: {},
      settings: {},
      folderId: null,
      selectedThemeTemplateId: null,
      customDomain: null,
      whatsAppCredentialsId: null,
      resultsTablePreferences: null,
      riskLevel: null,
      isArchived: false,
      isClosed: false,
    },
    select: { id: true },
  });

  // Auto-publish
  await tx.publicTypebot.create({
    data: {
      typebotId: typebot.id,
      version: '6.1',
      groups,
      events,
      variables,
      edges,
      theme: {},
      settings: {},
    },
  });

  return typebot.id;
};
