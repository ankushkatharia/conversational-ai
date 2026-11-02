"""Static GraphQL documents. User input only ever flows through variables."""

_HIT_FIELDS = """
          productName
          url
          orderable
          currency
          prices { list { min max } sale { min max } }
          colors {
            color
            name
            hex
            orderable
            assets {
              images(
                context: { width: 600, height: 600 }
                viewTypes: ["grid", "gridTileDesktop", "default"]
              ) {
                url
                viewType
              }
            }
          }
"""

SEARCH_PRODUCTS_QUERY = """
query McpSearchProducts($q: String, $first: Int, $refinement: SearchRefinementInput, $sort: String) {
  search(q: $q, first: $first, refinement: $refinement, sort: $sort) {
    totalCount
    count
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    refinementAttributes { attributeId label values { label hitCount selected } }
    sortingOptions { id label selected }
    edges {
      node {
        ... on MasterProductSearchHit {
          id
          style
          __HIT_FIELDS__
        }
        ... on SlicingGroupSearchHit {
          id
          slicedProductId
          __HIT_FIELDS__
        }
      }
    }
  }
}
""".replace("__HIT_FIELDS__", _HIT_FIELDS)

_ORDER_FIELDS = """
        orderNo
        creationDate
        status
        orderType
        currency
        productTotal
        shippingTotal
        taxTotal
        orderTotal
        orderItems {
          fulfillmentStatus
          productItem {
            quantity
            product {
              sku
              copy { name }
              prices { sale base discount total }
              assets { images(context: { width: 600, height: 600 }) { url viewType } }
            }
          }
        }
"""

GET_ORDERS_QUERY = """
query McpGetOrders($first: Int, $siteId: String!, $customerNo: String!) {
  orders(first: $first, input: { siteId: $siteId, customerNo: $customerNo }) {
    totalCount
    edges { node { __ORDER_FIELDS__ } }
  }
}
""".replace("__ORDER_FIELDS__", _ORDER_FIELDS)

# Tracking lives under fulfillmentGroups[].shipment. This OIS-backed `orders` resolver is the
# only path through the gateway that returns it (`orderByOrderNumber` returns a non-OIS view and
# `viewer.orders` is rejected at the transport layer), and it has no order-number filter.
GET_ORDER_DETAIL_QUERY = """
query McpGetOrderDetail($first: Int, $siteId: String!, $customerNo: String!) {
  orders(first: $first, input: { siteId: $siteId, customerNo: $customerNo }) {
    totalCount
    edges {
      node {
        __ORDER_FIELDS__
        fulfillmentGroups {
          type
          fulfillmentStatus
          shipment {
            shipmentId
            trackingNumber
            trackingLink
            estimatedDelivery
            dateShipped
            dateDelivered
          }
        }
      }
    }
  }
}
""".replace("__ORDER_FIELDS__", _ORDER_FIELDS)
