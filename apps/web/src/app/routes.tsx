import { createBrowserRouter, Navigate } from "react-router-dom";

import AppLayout from "./App";
import { AuctionPage } from "./AuctionPage";
import { BillingPage } from "./BillingPage";
import { PublicLayout } from "./PublicLayout";
import { ProtectedRoute } from "./ProtectedRoute";
import { DashboardPage } from "./DashboardPage";
import { MyCompanyPage } from "./MyCompanyPage";
import { CreditsPage } from "./CreditsPage";
import { BidsPage } from "./BidsPage";
import { PublicSearchPage } from "./PublicSearchPage";
import { ProductsPage } from "./ProductsPage";
import { ProductsManagementPage } from "./ProductsManagementPage";
import { ConfigPage } from "./ConfigPage";
import { NotificationsPage } from "./NotificationsPage";
import { ContactsPage } from "./ContactsPage";

import { Card } from "@/components/ui/Card";
import { LoginPage } from "@/features/auth/LoginPage";
import { CompanyForm } from "@/features/companies/CompanyForm";
import { CompanyPublicProfilePage } from "@/features/public/CompanyPublicProfilePage";
import { CompanySearchPage } from "@/features/public/CompanySearchPage";
import { HomePage } from "@/features/public/HomePage";
import { ProductSearchPage } from "@/features/public/ProductSearchPage";
import { ComoFuncionaPage } from "@/features/public/ComoFuncionaPage";
import { SerpapiCollectPage } from "@/features/admin/SerpapiCollectPage";
import { SerpapiRunDetailPage } from "@/features/admin/SerpapiRunDetailPage";
import { SerpapiConflictsPage } from "@/features/admin/SerpapiConflictsPage";
import { AdminCompaniesPage } from "@/features/admin/companies/AdminCompaniesPage";
import { AdminCompanyNewPage } from "@/features/admin/companies/AdminCompanyNewPage";
import { AdminCompanyDetailPage } from "@/features/admin/companies/AdminCompanyDetailPage";
import { AdminOfferedByPage } from "@/features/admin/offered-by/AdminOfferedByPage";
import { AdminOfferedByDashboardPage } from "@/features/admin/offered-by/AdminOfferedByDashboardPage";
import { SearchAnalyticsPage } from "@/features/search-analytics/SearchAnalyticsPage";
import { MessagesHistoryPage } from "@/features/messages/MessagesHistoryPage";
import { WhatsappAbusePage } from "@/features/admin/whatsapp/WhatsappAbusePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "search/companies", element: <CompanySearchPage /> },
      { path: "search/products", element: <ProductSearchPage /> },
      { path: "buscar", element: <PublicSearchPage /> },
      { path: "como-funciona", element: <ComoFuncionaPage /> },
      { path: "empresa/:id", element: <CompanyPublicProfilePage /> },
    ],
  },
  {
    path: "/login",
    element: (
      <Card className="mx-auto mt-20 max-w-md">
        <LoginPage />
      </Card>
    ),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/minha-empresa" replace /> },
          { path: "/dashboard", element: <Navigate to="/minha-empresa" replace /> },
          { path: "/minha-empresa", element: <MyCompanyPage /> },
          { path: "/leilao", element: <DashboardPage /> },
          { path: "/contatos", element: <ContactsPage /> },
          { path: "/produtos", element: <ProductsPage /> },
          { path: "/nichos", element: <Navigate to="/configuracoes" replace /> },
          { path: "/configuracoes", element: <ConfigPage /> },
          { path: "/configuracoes/leiloes", element: <AuctionPage /> },
          { path: "/configuracoes/produtos", element: <ProductsManagementPage /> },
          { path: "/lances", element: <BidsPage /> },
          { path: "/creditos", element: <CreditsPage /> },
          { path: "/admin/serpapi", element: <SerpapiCollectPage /> },
          { path: "/admin/serpapi/runs/:runId", element: <SerpapiRunDetailPage /> },
          { path: "/admin/serpapi/conflicts", element: <SerpapiConflictsPage /> },
          { path: "/admin/companies", element: <AdminCompaniesPage /> },
          { path: "/admin/companies/new", element: <AdminCompanyNewPage /> },
          { path: "/admin/companies/:companyId", element: <AdminCompanyDetailPage /> },
          { path: "/admin/analytics/searches", element: <SearchAnalyticsPage /> },
          { path: "/admin/abuso", element: <WhatsappAbusePage /> },
          { path: "/admin/oferecido-por", element: <AdminOfferedByPage /> },
          {
            path: "/admin/oferecido-por/:id/dashboard",
            element: <AdminOfferedByDashboardPage />,
          },
          { path: "/companies/new", element: <CompanyForm /> },
          { path: "/companies/:companyId", element: <CompanyForm /> },
          { path: "/auction", element: <AuctionPage /> },
          { path: "/billing", element: <BillingPage /> },
          { path: "/mensagens", element: <MessagesHistoryPage /> },
          { path: "/notificacoes", element: <NotificationsPage /> },
          { path: "/products", element: <Navigate to="/produtos" replace /> },
        ],
      },
    ],
  },
  { path: "/painel", element: <Navigate to="/leilao" replace /> },
]);
